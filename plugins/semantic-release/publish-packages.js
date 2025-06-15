import {
  verifyConditions,
  prepare as prepareNpm,
  addChannel as addChannelNpm,
  publish as publishNpm,
} from '@semantic-release/npm';

export async function verify(pluginConfig, context) {
  for (let config of pluginConfig.packages) {
    await verifyConditions(config, context);
  }
}

export async function prepare(pluginConfig, context) {
  for (let config of pluginConfig.packages) {
    await prepareNpm(config, context);
  }
}

export async function addChannel(pluginConfig, context) {
  for (let config of pluginConfig.packages) {
    await addChannelNpm(config, context);
  }
}

export async function publish(pluginConfig, context) {
  for (let config of pluginConfig.packages) {
    await publishNpm(config, context);
  }
}
