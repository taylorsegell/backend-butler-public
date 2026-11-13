const assert = require('node:assert/strict');

(async () => {
  const { buildTiles, keep } = await import('../src/lib/entities.ts');
  const entry = (id, name) => ({ entity_id: id, state: 'on', attributes: { friendly_name: name } });
  const main = ['light.light_bar', 'light.monitor_lights', 'light.corner_light'];
  const segments = ['light.light_bar_segment_1', 'light.monitor_lights_segment_16', 'light.renamed_child', 'light.friendly_only', 'light.segment3'];
  const noisy = ['light.hidden', 'light.disabled', 'light.diagnostic', 'light.configuration'];
  const hass = {
    states: {
      'light.light_bar': entry('light.light_bar', 'Light bar'),
      'light.monitor_lights': entry('light.monitor_lights', 'Monitor lights'),
      'light.corner_light': entry('light.corner_light', 'Corner Light'),
      'light.light_bar_segment_1': entry('light.light_bar_segment_1', 'Light bar Segment 1'),
      'light.monitor_lights_segment_16': entry('light.monitor_lights_segment_16', 'Monitor lights Segment 16'),
      'light.renamed_child': entry('light.renamed_child', 'Evening accent'),
      'light.friendly_only': entry('light.friendly_only', 'Light bar Segment 2'),
      'light.segment3': entry('light.segment3', 'Desk accent'),
      'light.segmented_lamp': entry('light.segmented_lamp', 'Segmented art lamp'),
      'switch.segment_1_power': entry('switch.segment_1_power', 'Segment 1 power'),
      ...Object.fromEntries(noisy.map(id => [id, entry(id, id)])),
    },
    entities: {
      ...Object.fromEntries([...main, ...segments, ...noisy].map(id => [id, { area_id: 'room' }])),
      'light.renamed_child': { area_id: 'room', name: 'Reading accent', original_name: 'Monitor lights Segment 8' },
      'light.hidden': { area_id: 'room', hidden_by: 'user' },
      'light.disabled': { area_id: 'room', disabled_by: 'user' },
      'light.diagnostic': { area_id: 'room', entity_category: 'diagnostic' },
      'light.configuration': { area_id: 'room', entity_category: 'config' },
    },
    areas: { room: { name: 'Office' } },
  };
  const exposed = new Set(Object.keys(hass.states));
  for (const id of [...segments, ...noisy]) {
    assert.equal(keep(hass, exposed, id), false, `${id} must stay excluded even when exposed`);
    assert.equal(keep(hass, null, id), false, `${id} must stay excluded without an expose list`);
  }
  for (const id of main) assert.equal(keep(hass, exposed, id), true, `whole-device control ${id} must remain`);
  assert.equal(keep(hass, null, 'light.segmented_lamp'), true, 'do not match the substring in a normal whole-light name');
  assert.equal(keep(hass, null, 'switch.segment_1_power'), true, 'light-segment filtering must not hide an unrelated power switch');

  const utilityIds = ['media_player.office_jarvis', 'media_player.norma', 'switch.norma_mute', 'switch.qbittorrent_alternative_speed', 'sensor.qbittorrent_status', 'switch.lamp_music_mode', 'switch.renamed_utility'];
  for (const id of utilityIds) hass.states[id] = entry(id, id);
  hass.entities['switch.renamed_utility'] = { platform: 'qbittorrent' };
  for (const id of utilityIds) {
    assert.equal(keep(hass, null, id), false, `${id} is not a physical room control`);
    const tiles = buildTiles(hass, {entities:[id]}, {agentAreas:[],actedOn:{ordered:[id],latest:new Set([id])},exposed:null,query:'',recent:[id]});
    assert.equal(tiles.length,0,'utility exclusion applies to explicit/recent/tool sources');
  }
  const quietHome = { states: {
    'light.kitchen': {...entry('light.kitchen','Kitchen'),state:'off',last_changed:'2020-01-01T00:00:00Z'},
    'light.bedroom': entry('light.bedroom','Bedroom'),
    'light.kitchen_segment_1': entry('light.kitchen_segment_1','Kitchen Segment 1'),
    'media_player.office': entry('media_player.office','Office Jarvis'),
  }, entities: {} };
  assert.deepEqual(buildTiles(quietHome, {}, {agentAreas:[],actedOn:{ordered:[],latest:new Set()},exposed:null,query:'',recent:[]}).map(t=>t.entityId).sort(), ['light.bedroom','light.kitchen'], 'default rail includes old off lights without recent activity or area metadata');
  const opts = { agentAreas: ['Office'], actedOn: { ordered: [], latest: new Set() }, exposed, query: '', recent: [] };
  const config = { type: 'custom:backend-butler-card', areas: ['room'] };
  const ids = (conf, options = opts, state = hass) => buildTiles(state, conf, options).map(tile => tile.entityId);
  assert.deepEqual(ids(config).sort(), [...main].sort(), 'area and followed-area candidates contain whole controls only');
  const explicit = { ...config, entities: [...segments, ...noisy, ...main] };
  assert.deepEqual(ids(explicit).sort(), [...main].sort(), 'explicit configuration cannot override segment/noise exclusion');
  const acted = { ...opts, actedOn: { ordered: [...segments, ...noisy, main[1]], latest: new Set([...segments, main[1]]) } };
  const actedTiles = buildTiles(hass, config, acted);
  assert.equal(actedTiles[0].entityId, main[1], 'an eligible acted-on whole device stays pinned first');
  assert.equal(actedTiles[0].touched, true, 'the whole-device highlight remains');
  assert.deepEqual(actedTiles.map(tile => tile.entityId).sort(), [...main].sort(), 'acted-on injection cannot reintroduce segments or hidden entities');
  assert.deepEqual(ids(config, { ...opts, recent: [...segments, ...noisy, main[0]] }).sort(), [...main].sort(), 'recent injection cannot reintroduce segments or hidden entities');
  assert.deepEqual(ids(explicit, { ...opts, query: 'Light bar Segment 1' }).sort(), [...main].sort(), 'query relevance cannot bring a segment back');
  assert.deepEqual(ids({ ...config, areas: [], entities: [main[0], ...segments] }, { ...opts, agentAreas: [], exposed: new Set([segments[0]]) }), [main[0]], 'a configured whole device can bypass exposure, while a configured exposed segment cannot');

  const unregisteredIds = ['light.light_bar_segment_1', 'light.monitor_lights_segment_16', 'light.friendly_only', 'light.segment3', ...main];
  const unregistered = { ...hass, entities: undefined };
  assert.deepEqual(ids({ ...config, entities: unregisteredIds }, { ...opts, recent: unregisteredIds }, unregistered).sort(), [...main].sort(), 'IDs and friendly names reject segments before registry metadata arrives');
  console.log('PASS: whole-device filtering across visibility, exposure, explicit config, area, recent, acted-on, query and missing-registry paths; ranking/highlights retained');
})().catch(error => { console.error(error); process.exit(1); });
