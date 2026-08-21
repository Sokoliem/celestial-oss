import { column, row, text } from '@celestial/core/nebula';
import { badge, card } from '@celestial/ui';

/**
 * badge and card are component descriptors: init() yields the model and
 * view(model) produces the VNode you embed in a parent tree.
 */
const operational = badge({ label: 'OPERATIONAL', variant: 'success' });
const [badgeModel] = operational.init();

export const healthCard = card({
  title: 'System Health',
  content: column(
    row(text('Status:   '), operational.view(badgeModel)),
    text('Workers:  8 active'),
    text('Memory:   420 MB / 1024 MB'),
  ),
});

export const [healthCardModel] = healthCard.init();
export const healthCardView = healthCard.view(healthCardModel);
