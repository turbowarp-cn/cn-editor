import React from 'react';
import {FormattedMessage} from 'react-intl';
import styles from './unsupported.css';

const Unsupported = () => (
    <div className={styles.container}>
        <p className={styles.title}>
            <FormattedMessage
                defaultMessage="Restore points not supported in this browser."
                description="Message that appears using old browser that doesn't support APIs needed for restore points"
                id="tw.restorePoints.unsupported1"
            />
        </p>
        <p>
            <FormattedMessage
                defaultMessage="Please use one of the following browsers or later:"
                description="Message that appears using old browser that doesn't support APIs needed for restore points"
                id="tw.restorePoints.unsupported2"
            />
        </p>
        <ul>
            <li>{'Chrome 86'}</li>
            <li>{'Edge 86'}</li>
            <li>{'Firefox 111'}</li>
            <li>{'Safari 15.2'}</li>
        </ul>
    </div>
);

export default Unsupported;
