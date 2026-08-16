module.exports = {
  webpack: {
    configure: (config) => {
      // 1) Excluir html5-qrcode del source-map-loader (evita los "Failed to parse source map")
      const addExcludeToSourceMapRules = (rules) => {
        if (!Array.isArray(rules)) return;
        for (const rule of rules) {
          // Si la regla usa loader directamente
          const usesSMLoader =
            (typeof rule.loader === 'string' && rule.loader.includes('source-map-loader')) ||
            (Array.isArray(rule.use) && rule.use.some(u => typeof u === 'string'
              ? u.includes('source-map-loader')
              : (u && typeof u.loader === 'string' && u.loader.includes('source-map-loader'))));

          if (usesSMLoader) {
            const patterns = [/html5-qrcode/, /node_modules[\\\/]html5-qrcode[\\\/]/];
            if (Array.isArray(rule.exclude)) {
              rule.exclude.push(...patterns);
            } else if (rule.exclude) {
              rule.exclude = [rule.exclude, ...patterns];
            } else {
              rule.exclude = patterns;
            }
          }

          // Recorre niveles anidados: oneOf / rules
          if (Array.isArray(rule.oneOf)) addExcludeToSourceMapRules(rule.oneOf);
          if (Array.isArray(rule.rules)) addExcludeToSourceMapRules(rule.rules);
        }
      };

      addExcludeToSourceMapRules(config.module?.rules);

      // 1.b) Como refuerzo, elimina por completo el uso de source-map-loader
      const stripSourceMapLoader = (rules) => {
        if (!Array.isArray(rules)) return;
        for (let i = rules.length - 1; i >= 0; i--) {
          const rule = rules[i];
          const isSMLoaderRule =
            (typeof rule.loader === 'string' && rule.loader.includes('source-map-loader')) ||
            (Array.isArray(rule.use) && rule.use.some(u => typeof u === 'string'
              ? u.includes('source-map-loader')
              : (u && typeof u.loader === 'string' && u.loader.includes('source-map-loader'))));

          if (isSMLoaderRule) {
            rules.splice(i, 1);
            continue;
          }
          if (Array.isArray(rule.oneOf)) stripSourceMapLoader(rule.oneOf);
          if (Array.isArray(rule.rules)) stripSourceMapLoader(rule.rules);
        }
      };
      stripSourceMapLoader(config.module?.rules);

      // 2) (Defensa adicional) Ignora warnings asociados al módulo html5-qrcode
      config.ignoreWarnings = [
        ...(config.ignoreWarnings || []),
        // Cubre el caso en que webpack adjunta la ruta del módulo
        { module: /html5-qrcode/ },
        // Cubre el caso de mensaje genérico del source-map-loader
        (warning) => {
          const msg = `${warning?.message || ''}`;
          const file = `${warning?.file || ''}`;
          // Solo ignoramos si además el módulo/archivo apunta a html5-qrcode
          const mentionsHtml5 = /html5-qrcode/.test(msg) || /html5-qrcode/.test(file);
          return mentionsHtml5 && /Failed to parse source map/i.test(msg);
        }
      ];

      return config;
    },
  },
};