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

  if (!id) {
    console.warn("[Notion Debug] NOTION_PAGE_ID is empty")
    return []
  }

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

  let block = response.block ?? {}

  const collectionId = Object.keys(response.collection ?? {})[0]
  const collectionValue = Object.values(response.collection ?? {})[0]?.value as any
  const collection = collectionValue?.value ?? collectionValue
  const schema = collection?.schema

  console.log("[Notion Debug] schema exists:", !!schema)

  const blockValue = (block?.[id]?.value as any)?.value ?? block?.[id]?.value
  const rawMetadata = blockValue

  console.log("[Notion Debug] rawMetadata type:", rawMetadata?.type)
  console.log("[Notion Debug] rawMetadata view_ids:", rawMetadata?.view_ids)
  console.log("[Notion Debug] rawMetadata collection_id:", rawMetadata?.collection_id)
  console.log("[Notion Debug] rawMetadata space_id:", rawMetadata?.space_id)

  if (!schema) {
    console.warn("[Notion Debug] schema is empty")
    return []
  }

  if (
    rawMetadata?.type !== "collection_view_page" &&
    rawMetadata?.type !== "collection_view"
  ) {
    console.warn("[Notion Debug] invalid rawMetadata type:", rawMetadata?.type)
    return []
  }

  /**
   * 핵심 수정:
   * getPage() 결과에 collection_query가 비어 있으면
   * DB row 목록을 수동으로 가져온다.
   */
  if (Object.keys(response.collection_query ?? {}).length === 0) {
    const collectionViewId = rawMetadata?.view_ids?.[0]

    console.warn("[Notion Debug] collection_query is empty. Trying manual getCollectionData.")
    console.log("[Notion Debug] manual collectionId:", collectionId)
    console.log("[Notion Debug] manual collectionViewId:", collectionViewId)

    if (collectionId && collectionViewId) {
      const collectionViewRecord = response.collection_view?.[collectionViewId] as any
      const collectionView = collectionViewRecord?.value ?? collectionViewRecord

      try {
        const collectionData = await api.getCollectionData(
          collectionId,
          collectionViewId,
          collectionView,
          {
            limit: 999,
            spaceId: rawMetadata?.space_id,
          }
        )

        response.block = {
          ...(response.block ?? {}),
          ...(collectionData.recordMap?.block ?? {}),
        }

        response.collection = {
          ...(response.collection ?? {}),
          ...(collectionData.recordMap?.collection ?? {}),
        }

        response.collection_view = {
          ...(response.collection_view ?? {}),
          ...(collectionData.recordMap?.collection_view ?? {}),
        }

        response.collection_query = {
          ...(response.collection_query ?? {}),
          [collectionId]: {
            ...(response.collection_query?.[collectionId] ?? {}),
            [collectionViewId]: (collectionData.result as any)?.reducerResults,
          },
        }

        block = response.block ?? {}

        console.log(
          "[Notion Debug] manual collection_query count:",
          Object.keys(response.collection_query ?? {}).length
        )
        console.log(
          "[Notion Debug] manual block count:",
          Object.keys(response.block ?? {}).length
        )
      } catch (error) {
        console.error("[Notion Debug] manual getCollectionData failed:", error)
      }
    } else {
      console.warn("[Notion Debug] collectionId or collectionViewId is missing")
    }
  }

  const pageIds = getAllPageIds(response)

  console.log("[Notion Debug] pageIds count:", pageIds.length)
  console.log("[Notion Debug] pageIds sample:", pageIds.slice(0, 5))

  const data = []

  for (let i = 0; i < pageIds.length; i++) {
    const id = pageIds[i]
    const properties = (await getPageProperties(id, block, schema)) || null

    if (!properties) continue

    const pageBlockValue = (block?.[id]?.value as any)?.value ?? block?.[id]?.value

    properties.createdTime = new Date(
      pageBlockValue?.created_time
    ).toString()

    properties.fullWidth =
      (pageBlockValue?.format as any)?.page_full_width ?? false

    data.push(properties)
  }

  console.log("[Notion Debug] posts data count:", data.length)
  console.log("[Notion Debug] posts data sample:", data.slice(0, 3))

  data.sort((a: any, b: any) => {
    const dateA: any = new Date(a?.date?.start_date || a.createdTime)
    const dateB: any = new Date(b?.date?.start_date || b.createdTime)
    return dateB - dateA
  })

  const posts = data as TPosts
  return posts
}
