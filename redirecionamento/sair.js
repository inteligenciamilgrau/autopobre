// The game moved to autopobre.com.br. Its save-migration.js packs this browser's saves into the link
// and opens the same page there (/autopobre/dev/ becomes /dev/), or goes straight when there are none.
import {moveToNewAddress} from 'https://autopobre.com.br/save-migration.js';
globalThis.autopobreSaindo=true;
await moveToNewAddress('/autopobre');
