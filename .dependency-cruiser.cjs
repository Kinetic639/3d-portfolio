module.exports = {
  forbidden: [
    {
      name: "no-source-cycles",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-reference",
      severity: "error",
      from: { path: "^(apps|packages)/" },
      to: { path: "(^|/)reference/" },
    },
    {
      name: "no-production-to-development",
      severity: "error",
      from: {
        path: "^(apps/portfolio|packages/(runtime|contracts|experience-ui|portfolio-content))/",
      },
      to: {
        path: "^(apps/editor|packages/(world-authoring|world-build|diagnostics))/",
      },
    },
    {
      name: "compiler-source-only",
      severity: "error",
      from: { path: "^packages/world-build/" },
      to: {
        path: "^packages/world-authoring/(src|dist)/(commands|history|transactions)",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: "(^|/)(node_modules|dist|\\.next|reference)/",
    tsPreCompilationDeps: true,
  },
};
