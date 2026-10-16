import { nodeHandler } from '../server/node.js'

// Single Vercel function; vercel.json rewrites every /api/* path here and routing lives in server/handler.ts.
export default nodeHandler
