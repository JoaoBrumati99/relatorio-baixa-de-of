import { handleApiRequest, health } from '../src/server/apiHandlers.js'

export default {
  fetch: (request: Request) => handleApiRequest(request, health),
}
