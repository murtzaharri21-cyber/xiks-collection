#!/usr/bin/env node
/* ============================================================================
   reset-password.js — set (or reset) the admin password.

   Run this in the project folder on the server:

       node reset-password.js                     # generates a strong password
       node reset-password.js MyPass123           # sets the password you choose
       node reset-password.js MyPass123 owner     # sets it for a custom username

   Writes through db.js, so it works with BOTH storage modes:
     • local      → data/admins.json
     • Supabase   → the admins table (pass SUPABASE_URL + SUPABASE_SERVICE_KEY
                    the same way you start the server)
   Also refreshes data/ADMIN-LOGIN.txt next to it.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const db = require('./db');

const DATA = path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });

const pass = process.argv[2] || crypto.randomBytes(6).toString('base64url');
const user = process.argv[3] || 'admin';

if (pass.length < 8) {
  console.error('\n  Password must be at least 8 characters.\n');
  process.exit(1);
}

(async () => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pass, salt, 64).toString('hex');

  const existing = await db.admins().catch(() => ({}));
  const existed = Boolean(existing[user]);

  await db.saveAdmin(user, {
    salt,
    hash,
    created: (existing[user] && existing[user].created) || new Date().toISOString(),
    updated: new Date().toISOString(),
  });

  fs.writeFileSync(path.join(DATA, 'ADMIN-LOGIN.txt'),
`Xiks Collection — admin login
------------------------------
  username: ${user}
  password: ${pass}

  sign in at:  /admin            (on your live site:  https://your-domain/admin)
  change it:   Admin → Settings → Change password
  ${existed ? 'updated' : 'created'}:     ${new Date().toISOString()}
`);

  console.log('\n' + '='.repeat(58));
  console.log(existed ? '  ADMIN PASSWORD UPDATED' : '  ADMIN ACCOUNT CREATED');
  console.log('    username: ' + user);
  console.log('    password: ' + pass);
  console.log('    stored in the ' + db.label + ' database');
  console.log('    saved to  data/ADMIN-LOGIN.txt');
  console.log('='.repeat(58) + '\n');
})().catch(e => {
  console.error('\n  Could not save the new password.\n\n    ' + e.message +
    '\n\n  Database: ' + db.label +
    '\n  If you use Supabase, start the command with the same SUPABASE_URL and' +
    '\n  SUPABASE_SERVICE_KEY you use for the server.\n');
  process.exit(1);
});
