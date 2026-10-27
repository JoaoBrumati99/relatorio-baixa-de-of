import { handleApiRequest, health } from '../src/server/apiHandlers'

export default {
  fetch: (request: Request) => handleApiRequest(request, health),
}
