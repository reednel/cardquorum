# CardQuorum

![GitHub Release](https://img.shields.io/github/v/release/reednel/cardquorum) [![GitHub License](https://img.shields.io/github/license/reednel/cardquorum?color=purple)](https://github.com/reednel/cardquorum/blob/main/LICENSE) [![Repo Size](https://img.shields.io/github/repo-size/reednel/cardquorum)](https://github.com/reednel/cardquorum) ![GitHub issues](https://img.shields.io/github/issues/reednel/cardquorum)

A free and open source PWA for card games online. Or, it will be soon.

## Development Instructions

Requires [Node.js](https://nodejs.org/) (v20+), [pnpm](https://pnpm.io/), and [Docker](https://www.docker.com/).

### Setup

```sh
pnpm install
docker compose -f compose.dev.yml up -d # starts Postgres
cp .env.template .env                   # then fill in values
```

### Quick Commands

```sh
pnpm serve    # Starts frontend on :4200, backend on :3000/api
pnpm format   # Runs prettier formatter agaist the project
pnpm validate # Tests, lints, and builds the project
```

### More Commands

```sh
pnpm nx serve frontend    # Angular dev server on :4200 (also starts backend)
pnpm nx serve backend     # NestJS on :3000/api (standalone)
pnpm nx run-many -t build
pnpm nx run-many -t test
pnpm nx run-many -t lint
pnpm nx lint <project>    # lint a single project
pnpm prettier --check .   # check formatting
pnpm prettier --write .   # fix formatting
```

### Scaffolding a New Game Plugin

```sh
pnpm nx g @nx/js:lib --name=<game-name> --directory=libs/games/<game-name> --unitTestRunner=jest --bundler=none
```

## Project Goals & AI Use

1. To have a modern, online platform on which people can play card games (especially Sheepshead).
2. To give something back to the self-hosting community, from which I have benefitted so much.
3. To build expertise in areas of web-dev I lack experience with, and to use AI in a way that promotes real learning, and is sustainable for a project of this scale.

Development of this software has been accelerated through the careful and restrained use of Claude AI.

## Contributing

Users interested in expanding functionalities in Sheepshead Online are welcome to do so. Issues reports are encouraged through Github's [issue tracker](https://github.com/reednel/cardquorum/issues). See details on how to contribute and report issues in [CONTRIBUTING.md](CONTRIBUTING.md). All contributors are expected to adhere to the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

This software is licensed under the [AGPL-3.0 license](LICENSE).

## Acknowledgements

We owe thanks to all the projects that make CardQuorum run. (not that it runs right now)

- [Angular](https://github.com/angular)
- [Docker](https://github.com/docker)
- [Drizzle](https://github.com/drizzle-team)
- [Fastify](https://github.com/fastify)
- [NestJS](https://github.com/nestjs)
- [Node](https://github.com/nodejs)
- [Nx](https://github.com/nrwl/nx)
- [Playwright](https://github.com/microsoft/playwright)
- [Postgres](https://github.com/postgres)
- [Tailwind](https://github.com/tailwindlabs)
