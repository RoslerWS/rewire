const {
  FuseBox,
  JSONPlugin,
  CSSPlugin,
  EnvPlugin,
  SassPlugin,
  QuantumPlugin,
  Sparky,
  ImageBase64Plugin
} = require('fuse-box');

const {bumpVersion, npmPublish} = require('fuse-box/sparky');

const instructions = '> [index.ts]';
let fuse;

Sparky.task('config', (context) => {
  fuse = FuseBox.init({
    globals:              { default: '*' }, // we need to expore index in our bundles
    target:               context.target,
    homeDir:              context.home,
    useTypescriptCompiler:true,
    cache:                false,
    hash:                 false,
    // sourceMaps:           {[context.bundleName]: true},
    tsConfig:             'tsconfig-build.json',
    output:               `${context.home}/$name.js`,
    plugins:                         [
      JSONPlugin(),
      EnvPlugin({ NODE_ENV: context.isProduction ? 'production' : 'development' }),
      CSSPlugin(),
      [SassPlugin(), CSSPlugin()],
      ImageBase64Plugin(),
      context.isProduction && QuantumPlugin({
        target: 'npm',
        containedAPI: true,
        ensureES5: false,
        removeExportsInterop: true,
        uglify: {keep_fnames: true},
        treeshake: true,
        bakeApiIntoBundle: context.bundleName
      })
    ],
    experimentalFeatures:true
  });
  fuse.bundle(context.bundleName).instructions(instructions);
});

Sparky.task('copy-src', (context) => Sparky.src('./**', { base: `./packages/${context.pkg}/src`}).dest(`./packages/${context.pkg}/dist/`));
Sparky.task('copy-pkg', (context) => Sparky.src('./package.json', { base: `./packages/${context.pkg}` }).dest(`./packages/${context.pkg}/dist/`));
Sparky.task('copy-md',  (context) => Sparky.src('./*.md', { base: `./packages/${context.pkg}` }).dest(`./packages/${context.pkg}/dist/`));

async function build(context, pkg, targets) {
  context.pkg        = pkg;
  await Sparky.exec('copy-src', 'copy-pkg', 'copy-md');
  await Sparky.src(`./packages/${context.pkg}/dist/*.json`).file('package.json', (file) => {
    file.json(json => {
      json.typings    = './index.ts';
    });
    file.save();
  }).exec();
  for (const target of targets) {
    context.bundleName = `${target}-lib`;
    context.home       = `./packages/${pkg}/dist/`;
    context.target     = `browser@${target}`;
    await Sparky.resolve('config');
    await fuse.run();
  }
}

async function clean(context, pkg) {
  await Sparky.src(`./packages/${pkg}/dist`).clean(`./packages/${pkg}/dist`).exec();
}

async function _prepublish(context, pkg) {
  await bumpVersion(`./packages/${pkg}/package.json`, {type: 'beta'});
}

async function _publish(context, pkg) {
  await npmPublish({path: `./packages/${pkg}/dist`});
}

const modules = ['rewire-common', 'rewire-core', 'rewire-ui', 'rewire-grid', 'rewire-graphql'];

Sparky.task('dist', async(context) => {
  context.isProduction = true;
  for (const module of modules) {
    await build(context, module, ['es6', 'esnext']);
  }
});

Sparky.task('npmpublish', async(context) => {
  for (const module of modules) {
    await _publish(context, module);
  }
});

Sparky.task('prepublish', async(context) => {
  for (const module of modules) {
    await _prepublish(context, module, ['es6', 'esnext']);
  }
});

Sparky.task('clean', async(context) => {
  for (const module of modules) {
    await clean(context, module);
  }
});

Sparky.task('default', ['clean', 'dist'], () => { });

Sparky.task('publish', ['clean', 'prepublish', 'dist', 'npmpublish'], () => { });
