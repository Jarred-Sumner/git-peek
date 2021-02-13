import * as React from "react";
import { render, Box, Text, Instance } from "ink";
import TextInput from "ink-text-input";

const ConfirmPrompt = ({ onConfirm }) => {
  const [value, setValue] = React.useState(true);
  const [hasSet, setHasSet] = React.useState(false);

  const onConfirmYes = () => onConfirm(true);

  const onChange = React.useCallback(
    (newValue) => {
      const confirm = newValue.slice(0, 1).toLowerCase() === "y";
      onConfirm(confirm);
    },
    [setValue, setHasSet, onConfirm]
  );

  return (
    <Box>
      <Text color="whiteBright">Delete repository: </Text>
      <Text color="blue">
        <TextInput
          value={""}
          placeholder={"Y/n"}
          onChange={onChange}
          onSubmit={onConfirmYes}
        />
      </Text>
    </Box>
  );
};

export const renderConfirm = () => {
  return new Promise((resolve, reject) => {
    let result: Instance;
    let didResolve = false;
    function didSelect(value) {
      didResolve = true;
      result.unmount();
      result.cleanup();
      resolve(value);
      result = null;
    }

    try {
      result = render(<ConfirmPrompt onConfirm={didSelect} />, {});
    } catch (exception) {
      if (result) {
        result.unmount();
        result.cleanup();
      }

      console.error(exception);

      reject(exception);
    }

    result.waitUntilExit().then(() => {
      if (!didResolve) {
        process.exit();
      }
    });
  });
};
