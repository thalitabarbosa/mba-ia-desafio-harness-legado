// Regras de dependência do Balcão (G4, G6, G7, G8, G9 e a regra própria R3).
// tsPreCompilationDeps: true faz o cruiser enxergar imports só de tipo
// (import type, import('x') em posição de tipo), que o tsc apagaria.
const EXPRESS_OU_MULTER = '(^|node_modules/)(@types/)?(express|multer)(/|$)'
const PRISMA_CLIENT = '(^|node_modules/)(@prisma/client|\\.prisma/client)(/|$)'
const OPENAI = '(^|node_modules/)openai(/|$)'

module.exports = {
  forbidden: [
    {
      name: 'G4',
      comment: 'api/src/http não importa @prisma/client nem api/src/repositories',
      severity: 'error',
      from: { path: '^api/src/http/' },
      to: { path: [PRISMA_CLIENT, '^api/src/repositories/'] },
    },
    {
      name: 'G6',
      comment: 'api/src/services não importa express, multer nem api/src/http (nem só de tipo)',
      severity: 'error',
      from: { path: '^api/src/services/' },
      to: { path: [EXPRESS_OU_MULTER, '^api/src/http/'] },
    },
    {
      name: 'G7',
      comment: 'o pacote openai só é importado em api/src/integrations',
      severity: 'error',
      from: { path: '^(api|web)/', pathNot: '^api/src/integrations/' },
      to: { path: OPENAI },
    },
    {
      name: 'G8',
      comment: 'web/ não importa nada de api/ (nem só de tipo)',
      severity: 'error',
      from: { path: '^web/' },
      to: { path: '^api/' },
    },
    {
      name: 'G9',
      comment: 'nenhum import circular em api/src nem web/src',
      severity: 'error',
      from: { path: '^(api|web)/src/' },
      to: { circular: true },
    },
    {
      name: 'R3',
      comment: 'regra própria: @prisma/client só em api/src/repositories (worker, serviços e integrações usam os repositórios)',
      severity: 'error',
      from: { path: '^api/src/', pathNot: '^api/src/repositories/' },
      to: { path: PRISMA_CLIENT },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    detectJSDocImports: true,
    moduleSystems: ['es6', 'cjs', 'tsd'],
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.d.ts', '.js', '.mjs', '.cjs', '.json'],
    },
  },
}
