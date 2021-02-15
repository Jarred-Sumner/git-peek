let register: (editor: string) => void;
if (process.platform === "darwin") {
  register = require("./registerProtocol.mac").register;
} else if (process.platform === "win32") {
  register = require("./registerProtocol.windows").register;
} else {
  register = () => {
    throw "Unsupported Platform";
  };
}

export { register };
