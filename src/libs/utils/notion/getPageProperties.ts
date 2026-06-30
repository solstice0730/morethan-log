import { getTextContent, getDateValue } from "notion-utils"
import { NotionAPI } from "notion-client"
import { BlockMap, CollectionPropertySchemaMap } from "notion-types"
import { customMapImageUrl } from "./customMapImageUrl"

function sanitizeUndefined(value: any): any {
  if (value === undefined) return null

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUndefined(item))
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [
        key,
        sanitizeUndefined(val),
      ])
    )
  }

  return value
}

async function getPageProperties(
  id: string,
  block: BlockMap,
  schema: CollectionPropertySchemaMap
) {
  const api = new NotionAPI()

  const blockEntry = block?.[id]?.value as any
  const blockValue = blockEntry?.value ?? blockEntry

  const rawProperties = Object.entries(blockValue?.properties || [])
  const excludeProperties = ["date", "select", "multi_select", "person", "file"]

  const properties: any = {}

  for (let i = 0; i < rawProperties.length; i++) {
    const [key, val]: any = rawProperties[i]
    const propertySchema = schema[key]

    if (!propertySchema?.name) continue

    properties.id = id

    if (propertySchema.type && !excludeProperties.includes(propertySchema.type)) {
      properties[propertySchema.name] = getTextContent(val) ?? null
    } else {
      switch (propertySchema.type) {
        case "file": {
          try {
            const Block = blockValue
            const url: string = val?.[0]?.[1]?.[0]?.[1]
            const newUrl = url ? customMapImageUrl(url, Block) : null

            properties[propertySchema.name] = newUrl ?? null
          } catch (error) {
            properties[propertySchema.name] = null
          }
          break
        }

        case "date": {
          const dateProperty: any = getDateValue(val)

          if (dateProperty) {
            delete dateProperty.type
            properties[propertySchema.name] = sanitizeUndefined(dateProperty)
          } else {
            properties[propertySchema.name] = null
          }

          break
        }

        case "select": {
          const selects = getTextContent(val)

          if (selects?.length) {
            properties[propertySchema.name] = selects.split(",")
          } else {
            properties[propertySchema.name] = []
          }

          break
        }

        case "multi_select": {
          const selects = getTextContent(val)

          if (selects?.length) {
            properties[propertySchema.name] = selects.split(",")
          } else {
            properties[propertySchema.name] = []
          }

          break
        }

        case "person": {
          const rawUsers = val.flat()
          const users = []

          for (let i = 0; i < rawUsers.length; i++) {
            if (rawUsers[i]?.[0]?.[1]) {
              const userId = rawUsers[i][0]

              try {
                const res: any = await api.getUsers(userId)

                const resValue =
                  res?.recordMapWithRoles?.notion_user?.[userId[1]]?.value

                const fallbackName = [
                  resValue?.family_name,
                  resValue?.given_name,
                ]
                  .filter(Boolean)
                  .join("")

                const name = resValue?.name ?? (fallbackName || null)

                const user = {
                  id: resValue?.id ?? null,
                  name,
                  profile_photo: resValue?.profile_photo ?? null,
                }

                users.push(user)
              } catch (error) {
                users.push({
                  id: null,
                  name: null,
                  profile_photo: null,
                })
              }
            }
          }

          properties[propertySchema.name] = users
          break
        }

        default:
          break
      }
    }
  }

  return sanitizeUndefined(properties)
}

export { getPageProperties as default }
