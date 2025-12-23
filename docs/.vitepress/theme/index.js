import DefaultTheme from 'vitepress/theme';
import Demo from './components/Demo.vue';
import ShapeGallery from './components/ShapeGallery.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Demo', Demo);
    app.component('ShapeGallery', ShapeGallery);
  }
};
