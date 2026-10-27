import { handleApiRequest, registerPrint } from '../src/server/apiHandlers'

export default {
  fetch: (request: Request) => handleApiRequest(request, registerPrint),
}
