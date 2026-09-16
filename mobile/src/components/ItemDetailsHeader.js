import React from 'react';
import BackHeader from './BackHeader';

// Keep Back available independently of item loading, error, or action states.
export const itemDetailsHeaderOptions = {
  title: 'Item Details',
  header: ({ navigation }) => <BackHeader navigation={navigation} title="Item Details" />,
};
