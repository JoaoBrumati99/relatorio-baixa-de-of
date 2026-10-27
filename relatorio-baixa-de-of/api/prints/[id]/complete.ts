import { completePrint, handleApiRequest } from '../../../src/server/apiHandlers.js'

export default {
  fetch: (request: Request) => handleApiRequest(request, completePrint),
}
