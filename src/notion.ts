/**
 * Notion Agent
 *
 * Copyright (c) 2020 Tomohisa Oda
 */

import {
  LoadPageChunkResponse,
  LoadUserContentResponse,
  Space,
  Block,
  Permission
} from './response_types'

export type Config = {
  token: string
  workspace: string
}

export type Page = {
  id: string
  title: string
  isPublic: boolean
}

/**
 * Notion Client
 */
export class Notion {
  private token: string
  private spaceName: string
  private spaceId: string
  private count: number
  private stackedPages: Page[]

  public constructor(c: Config) {
    this.token = c.token
    this.spaceName = c.workspace
    this.count = 0
  }

  public request<T>({ endpoint, body }): T {
    const url = "https://www.notion.so/api/v3/"

    const options = {
      headers: {
        accept: "*/*",
        "accept-language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
        "content-type": "application/json",
        cookie: `token_v2=${this.token};`
      },
      method: 'post' as const,
      muteHttpExceptions: true,
      payload: JSON.stringify(body)
    }
    const res = UrlFetchApp.fetch(`${url}${endpoint}`, options)
    this.count++
    if (res.getResponseCode() !== 200) {
      console.log(endpoint, this.count, res.getResponseCode(), res)
      return JSON.parse('{}')
    }

    return JSON.parse(res.getContentText())
  }

  public getTopLevelPages(): Page[] {
    const res = this.request<LoadUserContentResponse>({ endpoint: 'loadUserContent', body: {} })

    if (!(res.recordMap && res.recordMap.hasOwnProperty('space') && res.recordMap.hasOwnProperty('block'))) {
      return []
    }

    Object.values(res.recordMap.space).map((v: Space) => {
      if (v.value.name === this.spaceName) {
        this.spaceId = v.value.id
        return
      }
    })

    return Object.values(res.recordMap.block).map((v: Block): Page => {
      const { id, parent_id, properties, type, permissions } = v.value
      if (parent_id === this.spaceId && properties && properties.hasOwnProperty('title')) {
        return { id, title: properties.title.join(','), isPublic: this.isPublic(permissions) }
      }
    }).filter(el => {
      return el !== undefined
    }).filter((el, i, arr) => {
      return arr.findIndex(ell => el.id === ell.id) === i
    })
  }

  public isPublic(permissions: Permission[]|undefined): boolean {
    if (permissions === undefined) {
      return false
    }
    for (const o of permissions) {
      if (o.type && o.type === 'public_permission') {
        return true
      }
    }
    return false
  }

  public loadPageChunk(pageId: string): Block[] {
    const body = {
      pageId,
      limit: 1000,
      cursor: { stack: [] },
      chunkNumber: 0,
      verticalColumns: false
    }
    const res = this.request<LoadPageChunkResponse>({ endpoint: 'loadPageChunk', body })

    if (res && res.recordMap && res.recordMap.hasOwnProperty('block')) {
      return Object.values(res.recordMap.block)
    }

    return []
  }

  public getChildPages(pageId: string): Page[] {
    const res = this.loadPageChunk(pageId)
    if (res.length === 0) {
      return []
    }

    const columns = res.filter(el => { return el.value.type === 'column' })

    const pages = res.map((v: any): Page => {
      const { id, parent_id, properties, type, permissions } = v.value
      if (type == 'page' && properties && properties.hasOwnProperty('title')) {
        if (parent_id === pageId) {
          return { id, title: properties.title.join(','), isPublic: this.isPublic(permissions) } as Page
        } else {
          if (columns.some(el => el.value.id === parent_id)) {
            return { id, title: properties.title.join(','), isPublic: this.isPublic(permissions) } as Page
          }
        }
      }
    })

    return pages.filter(el => {
      return el !== undefined
    }).filter((el, i, arr) => {
      return arr.findIndex(ell => el.id === ell.id) === i
    })
  }

  public getPagesRecursively(pages): void {
    if (pages.length === 0) {
      return
    }

    let foundPages = []
    for (const page of pages) {
      //console.log(page)
      Utilities.sleep(Math.floor(Math.random() * Math.floor(10)) + 100)
      const gotPages = this.getChildPages(page.id)
      for (const gotPage of gotPages) {
        if (this.stackedPages.some(el => el.id === gotPage.id)) {
          continue
        }
        foundPages.push(gotPage)
      }
    }

    this.stackedPages = this.stackedPages.concat(...foundPages).filter((el, i, arr) => {
      return arr.findIndex(ell => el.id === ell.id) === i
    })

    this.getPagesRecursively(foundPages)
  }

  public getAllPages(): Page[] {
    this.stackedPages = []
    const topLevelPages: Page[] = this.getTopLevelPages()
    this.getPagesRecursively(topLevelPages)
    return this.stackedPages
  }
}
