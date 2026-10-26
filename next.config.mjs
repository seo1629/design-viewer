/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['pdfjs-dist'],
  webpack: (config, { webpack }) => {
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    config.resolve.fallback = { fs: false, path: false, crypto: false, module: false, canvas: false };
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    // libredwg-web은 patch-package로 고쳐 씁니다(patches/). webpack 빌드 캐시는 node_modules 안 파일을
    // 패키지 버전만 보고 그대로 재사용하므로, 이 패키지만은 내용으로 확인하게 해 Vercel 캐시에 옛 파일이 남지 않게 합니다.
    config.snapshot = {
      ...config.snapshot,
      managedPaths: [/^(.+?[\\/]node_modules[\\/])(?!@mlightcad[\\/]libredwg-web[\\/])/],
    };
    config.module.unknownContextCritical = false;
    // libredwg-web WASM glue does `import("node:module")`; webpack treats `node:` as an unknown URI.
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, '');
      }),
      new webpack.IgnorePlugin({ resourceRegExp: /^node:/ }),
    );
    const { NormalModule } = webpack;
    if (NormalModule?.getCompilationHooks) {
      config.plugins.push({
        apply(compiler) {
          compiler.hooks.compilation.tap('NodeSchemeStub', (compilation) => {
            NormalModule.getCompilationHooks(compilation)
              .readResourceForScheme.for('node')
              .tapAsync('NodeSchemeStub', (_resource, _mod, callback) => {
                callback(null, 'module.exports = {};');
              });
          });
        },
      });
    }
    return config;
  },
};

export default nextConfig;
