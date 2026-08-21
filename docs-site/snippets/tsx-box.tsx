import { color } from '@celestial/core/corona';
import { Box, Button, Divider, Row, Text } from '@celestial/core/jsx';

interface MissionModel {
  count: number;
}

/**
 * The optional JSX layer compiles to the same VNodes the functional builders
 * produce. Button onClick takes a message-tag string that flows through the
 * app's update loop like every other interaction.
 */
export function missionControlView(model: MissionModel) {
  return (
    <Box border="rounded" padding={1} borderColor={color.brightCyan}>
      <Text bold color={color.brightWhite}>
        🚀 Launch Mission Control
      </Text>
      <Divider />
      <Text color={color.brightCyan}>Current Count: {model.count}</Text>
      <Row gap={2}>
        <Button label="+ Increment" focused onClick="increment" />
        <Button label="- Decrement" onClick="decrement" />
        <Button label="Q Quit" onClick="quit" />
      </Row>
    </Box>
  );
}
