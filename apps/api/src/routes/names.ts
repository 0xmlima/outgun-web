// SPDX-License-Identifier: GPL-2.0-or-later
// Checagem pública de nome (OG-082): se um nome é válido, se está livre para cadastro e como um
// convidado com ele apareceria em jogo.
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { checkName, checkRegisteredName, guestName } from '@outgun/protocol';
import type { AppDeps } from '../app.js';
import { nameOwner } from '../auth/names.js';

export function nameRoutes({ database }: AppDeps): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.get(
      '/names/check',
      {
        schema: {
          tags: ['contas'],
          summary: 'Nome válido? Livre? Como aparece para um convidado?',
          querystring: Type.Object({ name: Type.String({ maxLength: 64 }) }),
          response: {
            200: Type.Object({
              valid: Type.Boolean(),
              registrable: Type.Boolean(),
              taken: Type.Boolean(),
              guestName: Type.Union([Type.String(), Type.Null()]),
            }),
          },
        },
      },
      async (request) => {
        const { name } = request.query;
        const valid = checkName(name);
        const taken = valid && (await nameOwner(database.db, name)) !== undefined;
        return {
          valid,
          registrable: checkRegisteredName(name) && !taken,
          taken,
          guestName: valid && !taken ? guestName(name) : null,
        };
      },
    );
  };
}
