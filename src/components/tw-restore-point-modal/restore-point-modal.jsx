import {defineMessages, FormattedMessage, intlShape, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import Modal from '../../containers/modal.jsx';
import RestorePoint from './restore-point.jsx';
import styles from './restore-point-modal.css';
import classNames from 'classnames';
import {APP_NAME} from '../../lib/brand';

const messages = defineMessages({
    title: {
        defaultMessage: 'Restore Points',
        description: 'Title of restore point management modal',
        id: 'tw.restorePoints.title'
    }
});

const RestorePointModal = props => (
    <Modal
        className={styles.modalContent}
        onRequestClose={props.onClose}
        contentLabel={props.intl.formatMessage(messages.title)}
        id="restorePointModal"
    >
        <div className={styles.body}>
            <p>
                <FormattedMessage
                    // eslint-disable-next-line max-len
                    defaultMessage="{APP_NAME} periodically creates restore points to help recover your project if you forget to save. This is intended as a last resort for recovery. Your computer may silently delete these restore points at any time. Do not rely on this feature."
                    id="tw.restorePoints.description"
                    values={{
                        APP_NAME: APP_NAME
                    }}
                />
            </p>

            {props.error ? (
                <div className={styles.error}>
                    <p>
                        <FormattedMessage
                            defaultMessage="Restore points are disabled because an error was encountered:"
                            description="Error message in restore point manager"
                            id="tw.restorePoints.error"
                            values={{
                                error: props.error
                            }}
                        />
                    </p>
                    <p className={styles.errorMessage}>
                        {props.error}
                    </p>
                </div>
            ) : props.isLoading ? (
                <div className={styles.loading}>
                    <FormattedMessage
                        defaultMessage="Loading..."
                        description="Loading message in restore point manager"
                        id="tw.restorePoints.loading"
                    />
                </div>
            ) : props.restorePoints.length === 0 ? (
                <div>
                    <div className={styles.empty}>
                        <FormattedMessage
                            defaultMessage="No restore points found."
                            description="Message that appears when no restore points exist yet"
                            id="tw.restorePoints.empty"
                        />
                    </div>

                    <div className={styles.legacyTransition}>
                        {/* This is going away within a few days */}
                        {/* No reason to bother translating */}
                        <span>
                            {/* eslint-disable-next-line max-len */}
                            {'We just rewrote restore points from the ground up. If you were expecting to find a project here, try loading the old restore point:'}
                        </span>
                        <button
                            className={classNames(styles.button, styles.loadLegacyButton)}
                            onClick={props.onClickLoadLegacy}
                        >
                            {'Load'}
                        </button>
                    </div>
                </div>
            ) : (
                <div>
                    <div className={styles.restorePointContainer}>
                        {props.restorePoints.map(restorePoint => (
                            <RestorePoint
                                key={restorePoint.id}
                                onClickDelete={props.onClickDelete}
                                onClickLoad={props.onClickLoad}
                                {...restorePoint}
                            />
                        ))}
                    </div>

                    <div className={styles.buttonContainer}>
                        <button
                            onClick={props.onClickDeleteAll}
                            className={classNames(styles.button, styles.deleteAllButton)}
                            disabled={props.isLoading}
                        >
                            <FormattedMessage
                                defaultMessage="Delete All"
                                description="Button to delete all restore points"
                                id="tw.restorePoints.deleteAll"
                            />
                        </button>
                    </div>
                </div>
            )}
        </div>
    </Modal>
);

RestorePointModal.propTypes = {
    intl: intlShape,
    onClose: PropTypes.func.isRequired,
    onClickCreate: PropTypes.func.isRequired,
    onClickDelete: PropTypes.func.isRequired,
    onClickDeleteAll: PropTypes.func.isRequired,
    onClickLoad: PropTypes.func.isRequired,
    onClickLoadLegacy: PropTypes.func.isRequired,
    isLoading: PropTypes.bool.isRequired,
    restorePoints: PropTypes.arrayOf(PropTypes.shape({})),
    error: PropTypes.string
};

export default injectIntl(RestorePointModal);
