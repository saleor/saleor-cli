import type { Arguments, CommandBuilder } from "yargs";
import yaml from "yaml";
import { emphasize } from 'emphasize';
import chalk from 'chalk';

import { API, PUT } from "../../lib/index.js";
import { Options } from "../../types.js";
import { promptVersion } from "../../lib/util.js";
import { useEnvironment } from "../../middleware/index.js";

export const command = "upgrade [environment]";
export const desc = "Upgrade a Saleor version in a specific environment";

export const builder: CommandBuilder = (_) => _

export const handler = async (argv: Arguments<Options>) => {
  const service = await promptVersion(argv);
  const result = await PUT(API.UpgradeEnvironment, argv, { json: { service: service.value }}) as any;n

  console.log("---")
  console.log(emphasize.highlight("yaml", yaml.stringify(result), {
    'attr': chalk.blue
  }).value);

  process.exit(0);
};

export const middlewares = [
  useEnvironment
]
