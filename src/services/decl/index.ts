/**
 * DECL service: code generation and component/utils for DECL format.
 * Re-exports all public API from types, declCodeGenerator and declComponentUtils.
 * loadAllComponents is in components/decl; loadAllActions is in services/actions.
 */

export { type DeclNode, type DeclData, type DeclSpec, type DeclGenerateContext } from './types'
export { type RenderContext } from '../../components/decl'
export { generate } from './generator'
export {
  tryParseJsonFromText,
  createDataBind,
  createActionBind,
  renderDeclNodes,
  renderDeclNode
} from './utils'
