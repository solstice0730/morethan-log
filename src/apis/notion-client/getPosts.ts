import { CONFIG } from "site.config"
import { NotionAPI } from "notion-client"
import { idToUuid } from "notion-utils"

import getAllPageIds from "src/libs/utils/notion/getAllPageIds"
import getPageProperties from "src/libs/utils/notion/getPageProperties"
import { TPosts } from "src/types"

/**
 * @param {{ includePages: boolean }} - false: posts only / true: include pages
 */

// TODO: react query를 사용해서 처음 불러온 뒤로는 해당데이터만 사용하도록 수정
export const getPosts = async () => {
  let id = CONFIG.notionConfig.pageId as string
  const api = new NotionAPI()
  
  const response = await api.getPage(id)
  
  console.log("[Notion Debug] raw pageId:", id)
  console.log("[Notion Debug] block count:", Object.keys(response.block ?? {}).length)
  console.log("[Notion Debug] collection count:", Object.keys(response.collection ?? {}).length)
  console.log(
    "[Notion Debug] collection_query count:",
    Object.keys(response.collection_query ?? {}).length
  )
  console.log("[Notion Debug] collection keys:", Object.keys(response.collection ?? {}))
  console.log(
    "[Notion Debug] collection_query keys:",
    Object.keys(response.collection_query ?? {})
  )
  
  id = idToUuid(id)
  
  const collectionValue = Object.values(response.collection ?? {})[0]?.value as any
  const collection = collectionValue?.value ?? collectionValue
  const block = response.block ?? {}
  const schema = collection?.schema
  
  console.log("[Notion Debug] schema exists:", !!schema)
  
  const blockValue = (block?.[id]?.value as any)?.value ?? block?.[id]?.value
  const rawMetadata = blockValue
  
  console.log("[Notion Debug] rawMetadata type:", rawMetadata?.type)
  
  if (!schema) {
    console.warn("[Notion Debug] schema is empty")
    return []
  }
  
  if (!rawMetadata) {
    console.warn("[Notion Debug] rawMetadata is empty")
    return []
  }

  // Check Type
  if (
    rawMetadata?.type !== "collection_view_page" &&
    rawMetadata?.type !== "collection_view"
  ) {
    return []
  } else {
    // Construct Data
    const pageIds = getAllPageIds(response)
    
    console.log("[Notion Debug] pageIds count:", pageIds.length)
    console.log("[Notion Debug] pageIds sample:", pageIds.slice(0, 5))
    const data = []
    for (let i = 0; i < pageIds.length; i++) {
      const id = pageIds[i]
      const properties = (await getPageProperties(id, block, schema)) || null
      // Add fullwidth, createdtime to properties
      const pageBlockValue = (block[id].value as any)?.value ?? block[id].value
      properties.createdTime = new Date(
        pageBlockValue?.created_time
      ).toString()
      properties.fullWidth =
        (pageBlockValue?.format as any)?.page_full_width ?? false

      data.push(properties)
      console.log("[Notion Debug] posts data count:", data.length)
      console.log("[Notion Debug] posts data sample:", data.slice(0, 3))
    }

    // Sort by date
    data.sort((a: any, b: any) => {
      const dateA: any = new Date(a?.date?.start_date || a.createdTime)
      const dateB: any = new Date(b?.date?.start_date || b.createdTime)
      return dateB - dateA
    })

    const posts = data as TPosts
    return posts
  }
}
