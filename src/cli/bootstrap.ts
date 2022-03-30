import type { Arguments, CommandBuilder } from "yargs";
import { download, extract } from "gitly";
import enquirer from 'enquirer';
import ora from "ora";
import { exec } from 'child_process';
import { existsSync } from 'fs';

type Options = {
  name: string;
  kind: string | undefined;
};

export const command = "bootstrap [name]";
export const desc = "Boostrap example [name]";

export const builder: CommandBuilder<{}, Options> = (_) =>
  _.positional("name", { type: "string", demandOption: true, default: "saleor-app" })
  .option("kind", { type: "string" })

export const handler = async (argv: Arguments<Options>): Promise<void> => {
  const examples = ['flutter','react-cra-typescript','react-native-typescript', 'react-nextjs-apollo-typescript']
  const { kind } = await enquirer.prompt<{ kind: string }>({
    type: "select",
    name: 'kind',
    message: 'Choose template',
    choices: examples,
    skip: examples.includes(argv.kind || '')
  });

  const ghPath = `saleor/example-${kind}`;
  const spinner = ora('Downloading...').start();
  const file = await download(ghPath)

  spinner.text = 'Extracting...'
  const suffix = existsSync(argv.name) ? '-0' : '';
  await extract(file, `${argv.name}${suffix}`)

  spinner.text = 'Installing dependencies...'
  process.chdir(argv.name);

  const pkgCmd = kind === 'flutter' ? 'flutter pub get' : 'npm install'
  const child = await exec(pkgCmd);

  for await (const _ of child.stdout || []) {
    spinner.text = 'Installing dependencies...'
  };
  spinner.succeed('Done...')
};