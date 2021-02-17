import { terminal, Terminal } from "which-term";
export default process.env["OPEN_IN_TERMINAL"] || terminal;
