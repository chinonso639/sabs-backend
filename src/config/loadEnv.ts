import dotenv from "dotenv";
import path from "path";

const envFiles = [
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../../backend.env"),
  path.resolve(__dirname, "../../../backend.env"),
];

for (const envFile of envFiles) {
  dotenv.config({ path: envFile });
}
