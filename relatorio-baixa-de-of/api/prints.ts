import { handleApiRequest, registerPrint } from '../src/server/apiHandlers.js'

export default {
  fetch: (request: Request) => handleApiRequest(request, registerPrint),
}
