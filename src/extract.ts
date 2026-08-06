import { runExtraction } from "./service.js";
import { errorText } from "./util.js";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length);
}

runExtraction(argument("industry") ?? "47.710").catch((error) => {
  console.error(errorText(error));
  process.exitCode = 1;
});
