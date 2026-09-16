import React from 'react';
import BackHeader from './BackHeader';

export default function RequestQueueHeader({ navigation }) {
  return <BackHeader navigation={navigation} title="People waiting" fallbackTab="MyItems" />;
}

export const requestQueueHeaderOptions = {
  title: 'People waiting',
  header: ({ navigation }) => <RequestQueueHeader navigation={navigation} />,
};
