import {
  verifyConditions,
  prepare as prepareNpm,
  addChannel as addChannelNpm,
  publish as publishNpm,
} from '@semantic-release/npm';

async function verify(pluginConfig, context) {
  for (let config of pluginConfig.packages) {
    await verifyConditions(config, context);
  }
}

async function prepare(pluginConfig, context) {
  for (let config of pluginConfig.packages) {
    await prepareNpm(config, context);
  }
}

async function addChannel(pluginConfig, context) {
  for (let config of pluginConfig.packages) {
    await addChannelNpm(config, context);
  }
}

async function publish(pluginConfig, context) {
  for (let config of pluginConfig.packages) {
    await publishNpm(config, context);
  }
}

module.exports = { verify, prepare, addChannel, publish };
