import { CanvaApiError, CanvaNotConnectedError } from "./autofill";

/**
 * Turns whatever Canva threw into a short, human-readable sentence — never a
 * raw stack trace or API error body. Every server action that talks to
 * Canva should route its catch block through this.
 */
export function describeCanvaError(err: unknown): string {
  if (err instanceof CanvaNotConnectedError) {
    return "Canva isn't connected. Connect Canva first, then try again.";
  }

  if (err instanceof CanvaApiError) {
    switch (err.status) {
      case 401:
        return "Canva's authorization has expired. Reconnect Canva and try again.";
      case 403:
        return "Canva refused this request — your account may not have permission for this design, or Autofill may require a Canva Enterprise plan.";
      case 404:
        return "Canva couldn't find that design or template. It may have been deleted, or the connected ID is incorrect.";
      case 408:
      case 504:
        return "Canva didn't respond in time. Please try again in a moment.";
      case 429:
        return "Canva is rate-limiting this app right now. Please wait a minute and try again.";
      default:
        return "Canva returned an error and couldn't complete this request. Please try again, or check the connection in Settings.";
    }
  }

  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return "Couldn't reach Canva — check your network connection and try again.";
  }

  return "Something went wrong talking to Canva. Please try again.";
}
