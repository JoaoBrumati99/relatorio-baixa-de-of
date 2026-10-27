import { completePrint, handleApiRequest } from '../../../src/server/apiHandlers'

export default {
  fetch: (request: Request) => handleApiRequest(request, completePrint),
}
