import {
  useEnvironment,
  useOrganization,
  useToken,
} from '../../middleware/index.js';
import * as create from './create.js';
import * as list from './list.js';
import * as restore from './restore.js';
import * as show from './show.js';

export default function (_: any) {
  _.command([list, create, show, restore])
    .middleware([useToken, useOrganization, useEnvironment])
    .demandCommand(1, 'You need at least one command before moving on');
}
