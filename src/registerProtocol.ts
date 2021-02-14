let register: (editor: string) => void;
if (process.platform === "darwin") {
  register = require("./registerProtocol.mac").register;
} else {
  register = () => {
    throw "Unsupported Platform";
  };
}

export { register };
