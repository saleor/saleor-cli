import { CliUx } from '@oclif/core';
import crypto from 'crypto';
import EventEmitter from 'events';
import got from 'got';
import { nanoid } from 'nanoid';
import { ServerApp } from 'retes';
import { Response } from 'retes/response';
import { GET } from 'retes/route';
import type { CommandBuilder } from 'yargs';

import { Config, ConfigField, SaleorCLIPort } from '../lib/config.js';
import { checkPort } from '../lib/detectPort.js';
import { API, getAmplifyConfig, getEnvironment, POST } from '../lib/index.js';
import { delay } from '../lib/util.js';

const { ux: cli } = CliUx;

const RedirectURI = `http://localhost:${SaleorCLIPort}/`;

export const command = 'login';
export const desc = 'Log in to the Saleor Cloud';

export const builder: CommandBuilder = (_) => _;

export const handler = async () => {
  await doLogin();
};

export const doLogin = async () => {
  await checkPort(SaleorCLIPort);

  const amplifyConfig = await getAmplifyConfig();

  const Params = {
    response_type: 'code',
    client_id: amplifyConfig.aws_user_pools_web_client_id,
    redirect_uri: RedirectURI,
    identity_provider: 'COGNITO',
    scope: amplifyConfig.oauth.scope.join(' '),
  };

  const generatedState = nanoid();
  const emitter = new EventEmitter();

  // const spinner = ora('\nLogging in...').start();
  await delay(1500);
  // spinner.text = '\nLogging in...\n';

  const QueryParams = new URLSearchParams({ ...Params, state: generatedState });
  const url = `https://${amplifyConfig.oauth.domain}/login?${QueryParams}`;
  cli.open(url);

  const app = new ServerApp([
    GET('/', async ({ params }) => {
      const { state, code } = params;

      if (state !== generatedState) {
        return Response.BadRequest('Wrong state');
      }

      const OauthParams = {
        grant_type: 'authorization_code',
        code,
        client_id: amplifyConfig.aws_user_pools_web_client_id,
        redirect_uri: RedirectURI,
      };

      try {
        const { id_token: idToken, access_token: accessToken }: any = await got
          .post(`https://${amplifyConfig.oauth.domain}/oauth2/token`, {
            form: OauthParams,
          })
          .json();

        const { token }: any = await POST(API.Token, {
          token: `Bearer ${idToken}`,
        });

        const environment = await getEnvironment();
        const userSession = crypto.randomUUID();

        const secrets: Record<ConfigField, string> = await got
          .post('https://id.saleor.live/verify', {
            json: {
              token: accessToken,
              environment,
            },
          })
          .json();

        await Config.reset();
        await Config.set('token', `Token ${token}`);
        await Config.set('user_session', userSession);
        for (const [name, value] of Object.entries(secrets)) {
          await Config.set(name as ConfigField, value);
        }
      } catch (error: any) {
        console.log(error);
      }

      // spinner.succeed(`You've successfully logged into Saleor Cloud!\n  Your access token has been safely stored, and you're ready to go`)
      emitter.emit('finish');

      return Response.Redirect(amplifyConfig.oauth.redirectSignIn);
    }),
  ]);
  await app.start(SaleorCLIPort);

  emitter.on('finish', async () => {
    await delay(1000);
    await app.stop();
  });
};
