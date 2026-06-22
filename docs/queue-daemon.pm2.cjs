// PM2 ecosystem for the IMA queue worker daemon.
// Install: pm2 start docs/queue-daemon.pm2.cjs
// Persist on reboot: pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: 'ima-queue-daemon',
      script: 'packages/cli/src/queue-daemon.ts',
      interpreter: 'node',
      // @ts-node is the bootstrap (npm installs it under devDependencies); we
      // re-use the project-local tsx loader instead because the codebase
      // already standardises on tsx for .ts execution.
      node_args: ['--import', './node_modules/tsx/dist/loader.mjs', '--no-warnings'],
      cwd: '/home/hermes/projects/influencer-multi-agent',
      autorestart: true,
      max_memory_restart: '256M',
      out_file: '/var/log/ima-queue-daemon.out.log',
      error_file: '/var/log/ima-queue-daemon.err.log',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
