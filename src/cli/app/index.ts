import * as create from './create.js';
import * as deploy from './deploy.js';
import * as generate from './generate.js';
import * as install from './install.js';
import * as list from './list.js';
import * as permission from './permission.js';
import * as publish from './publish.js';
import * as token from './token.js';
import * as tunnel from './tunnel.js';

export default function (_: any) {
  _.command([
    list,
    install,
    create,
    tunnel,
    token,
    permission,
    deploy,

    // no auth needed
    generate,
    publish,
  ])
    // .middleware([useToken, useOrganization, useEnvironment])
    .demandCommand(1, 'You need at least one command before moving on');
}
