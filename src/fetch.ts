import * as _fetch from "node-fetch";
import createFetcher from "@vercel/fetch";

export const fetch = createFetcher(_fetch);
export default fetch;
