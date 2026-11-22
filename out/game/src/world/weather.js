// Weather is the switchboard between time of day and every material that changes with it:
// sky, sea, windows, lamps, signage, fog and exposure. One call flips the whole city to dusk
// or night, and one update advances the shared clock.
import config from '../core/config.js';

export default class Weather {
  constructor({ plan, sky, water, buildings, props, streetDetail, landmarks, gulls, renderer, scene }) {
    this.plan = plan;
    this.sky = sky;
    this.water = water;
    this.buildings = buildings;
    this.props = props;
    this.landmarks = landmarks;
    this.gulls = gulls;
    this.renderer = renderer;
    this.scene = scene;
    this.period = 'golden';
    this.elapsed = 0;
    this.time = 0;
    this.minutes = 19 * 60 + 42;
    this.setPeriod('golden');
  }

  setPeriod(period) {
    this.period = period;
    this.sky.setPeriod(period);
    this.water.setPeriod(period, this.sky.sunDir);
    this.buildings.setPeriod(period);
    if (this.props) this.props.setPeriod(period);
    if (this.streetDetail) this.streetDetail.setPeriod(period);
    if (this.landmarks) this.landmarks.setPeriod(period);
    this.clock = period === 'night' ? config.clock.startNight : config.clock.startGolden;
    this.renderer.toneMappingExposure = period === 'night' ? config.render.exposureNight : config.render.exposureGolden;
    this.scene.fog.density = period === 'night' ? config.fog.night : config.fog.golden;
  }

  update(dt, focus) {
    this.elapsed += dt;
    this.sky.update(dt, focus);
    this.water.update(this.elapsed + 24);
    if (this.landmarks?.update) this.landmarks.update(dt, this.elapsed);
    if (this.gulls?.update) this.gulls.update(dt, this.elapsed);
  }
}
