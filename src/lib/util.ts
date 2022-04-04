import { format } from 'date-fns';
import chalk from "chalk";
import Enquirer from "enquirer";
import got from 'got';
import ora from 'ora';
import { emphasize } from 'emphasize';
import yaml from "yaml";

import { API, GET, POST, Region } from "../lib/index.js";
import { Options, ProjectCreate } from "../types.js";
import { SaleorAppByID } from '../graphql/SaleorAppByID.js';

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

// Higher-Order Creator for Prompts
const createPrompt = async (name: string, message: string, fetcher: any, extractor: any, allowCreation = false) => {
  const collection = await fetcher();

  if (!collection.length && !allowCreation) {
    console.warn(chalk.red(`No ${name}s found`))
    process.exit(0)
  }

  const creation = allowCreation ? [{name: "Create new"}] : []
  const choices = [...creation, ...collection.map(extractor)];

  const r = await Enquirer.prompt({
    type: 'select',
    name,
    choices: JSON.parse(JSON.stringify(choices)),
    message,
  }) as any;

  const { [name]: ret } = r;


  const result = choices.find((choice: any) => choice.name === ret)
  if (!result) {
    throw Error('something went wrong with prompt')
  }

  return { name: result.name, value: result.value }
}

const doRefreshToken = `
mutation refreshTokenWithUser($csrfToken: String!, $refreshToken: String!) {
  tokenRefresh(csrfToken: $csrfToken, refreshToken: $refreshToken) {
    token
  }
}
`

export const makeRequestRefreshToken = async (domain: string, argv: any) => {
  const { csrfToken, refreshToken } = argv;

  const { data, errors }: any = await got.post(`https://${domain}/graphql`, {
    json: {
      query: doRefreshToken,
      variables: { csrfToken, refreshToken }
    }
  }).json()

  if (errors) {
    throw new AuthError("cannot refresh the token")
  }

  const { tokenRefresh: { token } } = data;

  if (!token) {
    throw new AuthError("cannot auth")
  }

  return token
}

const AppList = `
query AppsList {
  apps(first: 100) {
    totalCount
    edges {
      node {
        id
        name
        isActive
        type
        webhooks {
          id
          name
          targetUrl
        }
      }
    }
  }
}
`

export const makeRequestAppList = async (argv: any) => {
  const { domain } = (await GET(API.Environment, argv)) as any;

  const token = await makeRequestRefreshToken(domain, argv);
  const { data, errors }: any = await got
    .post(`https://${domain}/graphql`, {
      headers: {
        "authorization-bearer": token,
        "content-type": "application/json",
      },
      json: { query: AppList },
    })
    .json();

  if (errors) {
    throw new AuthError("cannot auth")
  }

  return data.apps.edges;
};

//
// P U B L I C
//

export const promptWebhook = async (argv: any) => createPrompt(
  'webhookID',
  'Select a Webhook',
  async () => {
    const { domain } = (await GET(API.Environment, argv)) as any;
    const token = await makeRequestRefreshToken(domain, argv);

    const { app: appID } = argv;

    const { data, errors }: any = await got.post(`https://${domain}/graphql`, {
      headers: {
        'authorization-bearer': token,
        'content-type': 'application/json',
      },
      json: {
        query: SaleorAppByID,
        variables: { appID }
      }
    }).json()

    if (errors) {
      throw Error("cannot auth")
    }

    const { app: { name, webhooks } } = data;

    return webhooks;
  },
  ({ id, name, targetUrl }: any) => ({ name: `${name} (${targetUrl})`, value: id })
)

export const promptSaleorApp = async (argv: any) => createPrompt(
  'app',
  'Select a Saleor App',
  async () => {
    const collection = await makeRequestAppList(argv);
    return collection;
  },
  ({ node: { name, id } }: any) => ({ name, value: id })
)


export const promptVersion = async (argv: any) => createPrompt(
  'service',
  'Select a Saleor version',
  async () => await GET(API.Services, { region: Region, ...argv }),
  (_: any) => ({ name: `Saleor ${_.version} - ${_.display_name} - ${_.service_type}`, value: _.name })
)

export const promptCompatibleVersion = async (argv: any, service = "SANDBOX" ) => createPrompt(
  'production service',
  'Select a Saleor service',
  async () =>  (await GET(API.Services, { region: Region, ...argv }) as any).filter(({service_type}: any) => service_type === service),
  (_: any) => ({ name: `Saleor ${_.version} - ${_.display_name} - ${_.service_type}`, value: _.name })
)

export const promptDatabaseTemplate = async () => createPrompt(
  'database',
  'Select the database template',
  () => ([{name: 'sample', value: 'sample'},
          {name: 'blank', value: null},
          {name: 'snapshot', value: null}]),
  (_: any) => ({ name: _.name, value: _.value })
)

export const promptProject = (argv: any) => createPrompt(
  'project',
  'Select Project',
  async () => await GET(API.Project, argv),
  (_: any) => ({ name: _.name, value: _.slug }),
  true
)

export const promptEnvironment = async (argv: any) => createPrompt(
  'environment',
  'Select Environment',
  async () => await GET(API.Environment, {...argv, environment: ''}),
  (_: any) => ({ name: _.name, value: _.key }),
  false
);

export const promptOrganization = async (argv: any) => createPrompt(
  'organization',
  'Select Organization',
  async () => await GET(API.Organization, argv),
  (_: any) => ({ name: _.name, value: _.slug})
)

export const promptPlan = async (argv: any) => createPrompt(
  'plan',
  'Select Plan',
  async () => await GET(API.Plan, argv),
  (_: any) => ({ name: _.name, value: _.slug})
)

export const promptRegion = async (argv: any) => createPrompt(
  'region',
  'Select Region',
  async () => await GET(API.Region, argv),
  (_: any) => ({ name: _.name, value: _.name})
)

export const promptOrganizationBackup = async (argv: any) => createPrompt(
  'backup',
  'Select Snapshot',
  async () => await GET(API.OrganizationBackups, argv),
  (_: any) => ({ name: chalk(chalk.bold(_.project.name), chalk(",","ver:", _.saleor_version, ", created on", formatDateTime(_.created), "-"), chalk.bold(_.name)), value: _.key})
)

export const formatDateTime = (name: string) => format(new Date(name), "yyyy-MM-dd HH:mm")

export const printContext = (organization?: string, environment?: string) => {
  let message = `\n ${chalk.bgGray(' CONTEXT ')}\n`

  if (organization) message += ` ${chalk.gray('Organization')} ${organization} `
  if (environment) message += `- ${chalk.gray('Environment')} ${chalk.underline(environment)}`

  console.log(message + '\n')
}

export const createProject = async (argv: ProjectCreate) => {
  const { promptName } = await Enquirer.prompt({
    type: 'input',
    name: 'promptName',
    message: `Type name`,
    initial: argv.name,
    skip: !!argv.name,
  }) as { promptName: string };

  const choosenRegion = argv.region ? { value: argv.region } : await promptRegion(argv);
  const choosenPlan = argv.plan ? { value: argv.plan } :  await promptPlan(argv);

  const spinner = ora(`Creating project ${promptName}...`).start();

  const project = await POST(API.Project, argv, {
    json: {
      name: promptName,
      plan: choosenPlan.value,
      region: choosenRegion.value }
  }) as any;

  spinner.succeed(`Yay! Project ${promptName} created!`)

  return { name: project.slug, value: project.slug }
}

export const validateLength = ( value: string,
                                maxLength: number,
                                name = '',
                                required = false): boolean | string => {

  if (required && value.length < 1) {
    return chalk.red(`please provide value`)
  }

  if (value.length > maxLength) {
    console.log(chalk.red(`${name} please use ${maxLength} characters maximum`))
    return false
  }

  return true;
}

export const validateEmail = (value: string, required = true): boolean | string => {
  if (!required && value.length < 1) {
    return true;
  }

  const re = /\S+@\S+\.\S+/;
  if (!re.test(value)) {
    console.log(chalk.red(`please provide valid email`))
    return false
  }

  return true;
}

export const deploy = async ({ name, url }: { name: string, url: string }) => {
  const params = {
    'repository-url': 'https://github.com/saleor/react-storefront',
    'project-name': name || 'my-react-storefront',
    'repository-name': name || 'my-react-storefront',
    'env': 'NEXT_PUBLIC_API_URI,NEXT_PUBLIC_DEFAULT_CHANNEL',
    'envDescription': `'NEXT_PUBLIC_API_URI' is your GraphQL endpoint, while 'NEXT_PUBLIC_DEFAULT_CHANNEL' in most cases should be set to 'default-channel'`,
    'envLink': 'https://github.com/saleor/react-storefront',
  }

  const queryParams = new URLSearchParams(params)

  console.log('');
  console.log(`You will be redirected to Vercel's deployment page to finish the process`);
  console.log(`Use the following ${chalk.underline('Environment Variables')} for configuration:`);

  console.log(`
${chalk.gray('NEXT_PUBLIC_API_URI')}=${chalk.yellow(url)}
${chalk.gray('NEXT_PUBLIC_DEFAULT_CHANNEL')}=${chalk.yellow('default-channel')}
  `)

  console.log(`To complete the deployment, open the following link in your browser and continue there:`);
  console.log(`
https://vercel.com/new/clone?${queryParams}`);
}

export const checkIfJobSucceeded = async (taskId: string): Promise<boolean> => {
  const result = await GET(API.TaskStatus, {task: taskId}) as any;
  return result.status === "SUCCEEDED";
}

export const waitForTask = async (argv: Options, taskId: string, spinnerText: string, spinnerSucceed: string) => {
  let currentMsg = 0;
  const messages = [
    `🙌  If you see yourself working on tools like this one, Saleor is looking for great educators and DevRel engineers.
      Contact us directly at careers@saleor.io or DM on LinkedIn.`,
    `✨ Take your first steps with Saleor's API by checking our tutorial at https://learn.saleor.io`,
    `⚡ If you like React and Next.js, you may want to take a look at our storefront starter pack available at https://github.com/saleor/react-storefront`
  ]

  const spinner = ora(`${spinnerText}...`).start();
  let succeed = await checkIfJobSucceeded(taskId);

  while (!succeed) {
    await delay(10000)
    spinner.text = `${spinnerText}...

  ${messages[currentMsg]}`;

    if (currentMsg === (messages.length - 1)) {
      currentMsg = 0;
    } else {
      currentMsg++
    }

    succeed = await checkIfJobSucceeded(taskId);
  }

  spinner.succeed(`${spinnerSucceed}
  `);
}

export const showResult = (result: Record<string, unknown>) => {
  console.log("---")
  console.log(emphasize.highlight("yaml", yaml.stringify(result), {
    'attr': chalk.blue
  }).value);
}

export const confirmRemoval = async (argv: Options, name: string) => {
  const { proceed } = await Enquirer.prompt({
    type: 'confirm',
    name: 'proceed',
    initial: argv.force,
    skip: !!argv.force,
    message: `You are going to remove ${name}. Continue`,
  }) as { proceed: boolean };

  return proceed;
}

export const countries : { [key: string]: string} = {
  "": "",
  "AF": "Afghanistan",
  "AL": "Albania",
  "DZ": "Algeria",
  "AS": "American Samoa",
  "AD": "Andorra",
  "AO": "Angola",
  "AI": "Anguilla",
  "AQ": "Antarctica",
  "AG": "Antigua and Barbuda",
  "AR": "Argentina",
  "AM": "Armenia",
  "AW": "Aruba",
  "AU": "Australia",
  "AT": "Austria",
  "AZ": "Azerbaijan",
  "BS": "Bahamas (the)",
  "BH": "Bahrain",
  "BD": "Bangladesh",
  "BB": "Barbados",
  "BY": "Belarus",
  "BE": "Belgium",
  "BZ": "Belize",
  "BJ": "Benin",
  "BM": "Bermuda",
  "BT": "Bhutan",
  "BO": "Bolivia (Plurinational State of)",
  "BQ": "Bonaire, Sint Eustatius and Saba",
  "BA": "Bosnia and Herzegovina",
  "BW": "Botswana",
  "BV": "Bouvet Island",
  "BR": "Brazil",
  "IO": "British Indian Ocean Territory (the)",
  "BN": "Brunei Darussalam",
  "BG": "Bulgaria",
  "BF": "Burkina Faso",
  "BI": "Burundi",
  "CV": "Cabo Verde",
  "KH": "Cambodia",
  "CM": "Cameroon",
  "CA": "Canada",
  "KY": "Cayman Islands (the)",
  "CF": "Central African Republic (the)",
  "TD": "Chad",
  "CL": "Chile",
  "CN": "China",
  "CX": "Christmas Island",
  "CC": "Cocos (Keeling) Islands (the)",
  "CO": "Colombia",
  "KM": "Comoros (the)",
  "CD": "Congo (the Democratic Republic of the)",
  "CG": "Congo (the)",
  "CK": "Cook Islands (the)",
  "CR": "Costa Rica",
  "HR": "Croatia",
  "CU": "Cuba",
  "CW": "Curaçao",
  "CY": "Cyprus",
  "CZ": "Czechia",
  "CI": "Côte d'Ivoire",
  "DK": "Denmark",
  "DJ": "Djibouti",
  "DM": "Dominica",
  "DO": "Dominican Republic (the)",
  "EC": "Ecuador",
  "EG": "Egypt",
  "SV": "El Salvador",
  "GQ": "Equatorial Guinea",
  "ER": "Eritrea",
  "EE": "Estonia",
  "SZ": "Eswatini",
  "ET": "Ethiopia",
  "FK": "Falkland Islands (the) [Malvinas]",
  "FO": "Faroe Islands (the)",
  "FJ": "Fiji",
  "FI": "Finland",
  "FR": "France",
  "GF": "French Guiana",
  "PF": "French Polynesia",
  "TF": "French Southern Territories (the)",
  "GA": "Gabon",
  "GM": "Gambia (the)",
  "GE": "Georgia",
  "DE": "Germany",
  "GH": "Ghana",
  "GI": "Gibraltar",
  "GR": "Greece",
  "GL": "Greenland",
  "GD": "Grenada",
  "GP": "Guadeloupe",
  "GU": "Guam",
  "GT": "Guatemala",
  "GG": "Guernsey",
  "GN": "Guinea",
  "GW": "Guinea-Bissau",
  "GY": "Guyana",
  "HT": "Haiti",
  "HM": "Heard Island and McDonald Islands",
  "VA": "Holy See (the)",
  "HN": "Honduras",
  "HK": "Hong Kong",
  "HU": "Hungary",
  "IS": "Iceland",
  "IN": "India",
  "ID": "Indonesia",
  "IR": "Iran (Islamic Republic of)",
  "IQ": "Iraq",
  "IE": "Ireland",
  "IM": "Isle of Man",
  "IL": "Israel",
  "IT": "Italy",
  "JM": "Jamaica",
  "JP": "Japan",
  "JE": "Jersey",
  "JO": "Jordan",
  "KZ": "Kazakhstan",
  "KE": "Kenya",
  "KI": "Kiribati",
  "KP": "Korea (the Democratic People's Republic of)",
  "KR": "Korea (the Republic of)",
  "KW": "Kuwait",
  "KG": "Kyrgyzstan",
  "LA": "Lao People's Democratic Republic (the)",
  "LV": "Latvia",
  "LB": "Lebanon",
  "LS": "Lesotho",
  "LR": "Liberia",
  "LY": "Libya",
  "LI": "Liechtenstein",
  "LT": "Lithuania",
  "LU": "Luxembourg",
  "MO": "Macao",
  "MG": "Madagascar",
  "MW": "Malawi",
  "MY": "Malaysia",
  "MV": "Maldives",
  "ML": "Mali",
  "MT": "Malta",
  "MH": "Marshall Islands (the)",
  "MQ": "Martinique",
  "MR": "Mauritania",
  "MU": "Mauritius",
  "YT": "Mayotte",
  "MX": "Mexico",
  "FM": "Micronesia (Federated States of)",
  "MD": "Moldova (the Republic of)",
  "MC": "Monaco",
  "MN": "Mongolia",
  "ME": "Montenegro",
  "MS": "Montserrat",
  "MA": "Morocco",
  "MZ": "Mozambique",
  "MM": "Myanmar",
  "NA": "Namibia",
  "NR": "Nauru",
  "NP": "Nepal",
  "NL": "Netherlands (the)",
  "NC": "New Caledonia",
  "NZ": "New Zealand",
  "NI": "Nicaragua",
  "NE": "Niger (the)",
  "NG": "Nigeria",
  "NU": "Niue",
  "NF": "Norfolk Island",
  "MP": "Northern Mariana Islands (the)",
  "NO": "Norway",
  "OM": "Oman",
  "PK": "Pakistan",
  "PW": "Palau",
  "PS": "Palestine, State of",
  "PA": "Panama",
  "PG": "Papua New Guinea",
  "PY": "Paraguay",
  "PE": "Peru",
  "PH": "Philippines (the)",
  "PN": "Pitcairn",
  "PL": "Poland",
  "PT": "Portugal",
  "PR": "Puerto Rico",
  "QA": "Qatar",
  "MK": "Republic of North Macedonia",
  "RO": "Romania",
  "RU": "Russian Federation (the)",
  "RW": "Rwanda",
  "RE": "Réunion",
  "BL": "Saint Barthélemy",
  "SH": "Saint Helena, Ascension and Tristan da Cunha",
  "KN": "Saint Kitts and Nevis",
  "LC": "Saint Lucia",
  "MF": "Saint Martin (French part)",
  "PM": "Saint Pierre and Miquelon",
  "VC": "Saint Vincent and the Grenadines",
  "WS": "Samoa",
  "SM": "San Marino",
  "ST": "Sao Tome and Principe",
  "SA": "Saudi Arabia",
  "SN": "Senegal",
  "RS": "Serbia",
  "SC": "Seychelles",
  "SL": "Sierra Leone",
  "SG": "Singapore",
  "SX": "Sint Maarten (Dutch part)",
  "SK": "Slovakia",
  "SI": "Slovenia",
  "SB": "Solomon Islands",
  "SO": "Somalia",
  "ZA": "South Africa",
  "GS": "South Georgia and the South Sandwich Islands",
  "SS": "South Sudan",
  "ES": "Spain",
  "LK": "Sri Lanka",
  "SD": "Sudan (the)",
  "SR": "Suriname",
  "SJ": "Svalbard and Jan Mayen",
  "SE": "Sweden",
  "CH": "Switzerland",
  "SY": "Syrian Arab Republic",
  "TW": "Taiwan (Province of China)",
  "TJ": "Tajikistan",
  "TZ": "Tanzania, United Republic of",
  "TH": "Thailand",
  "TL": "Timor-Leste",
  "TG": "Togo",
  "TK": "Tokelau",
  "TO": "Tonga",
  "TT": "Trinidad and Tobago",
  "TN": "Tunisia",
  "TR": "Turkey",
  "TM": "Turkmenistan",
  "TC": "Turks and Caicos Islands (the)",
  "TV": "Tuvalu",
  "UG": "Uganda",
  "UA": "Ukraine",
  "AE": "United Arab Emirates (the)",
  "GB": "United Kingdom of Great Britain and Northern Ireland (the)",
  "UM": "United States Minor Outlying Islands (the)",
  "US": "United States of America (the)",
  "UY": "Uruguay",
  "UZ": "Uzbekistan",
  "VU": "Vanuatu",
  "VE": "Venezuela (Bolivarian Republic of)",
  "VN": "Viet Nam",
  "VG": "Virgin Islands (British)",
  "VI": "Virgin Islands (U.S.)",
  "WF": "Wallis and Futuna",
  "EH": "Western Sahara",
  "YE": "Yemen",
  "ZM": "Zambia",
  "ZW": "Zimbabwe",
  "AX": "Åland Islands"
}