import type { Arguments, CommandBuilder } from "yargs";
import { download, extract } from "gitly";
import enquirer from 'enquirer';
import ora from "ora";

type Options = {
  name: string;
  kind: string | undefined;
};

export const command = "bootstrap [name]";
export const desc = "Boostrap example [name]";

export const builder: CommandBuilder<{}, Options> = (_) =>
  _.positional("name", { type: "string", demandOption: true })
  .option("kind", { type: "string" })

export const handler = async (argv: Arguments<Options>): Promise<void> => {
  const { name } = await enquirer.prompt<{ name: string }>({
    type: "input",
    name: 'name',
    message: 'Please provide project name',
    skip: !!argv.name
  });

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
  await extract(file, name)

  spinner.succeed('Done...')
};
