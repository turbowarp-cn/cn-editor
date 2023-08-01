import {defineMessages, FormattedMessage, intlShape, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import RestorePoint from './restore-point.jsx';
import styles from './restore-point-modal.css';

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
        <Box
            className={styles.body}
        >
            <button onClick={props.onClickCreate}>Create!</button>
            <button onClick={props.onClickDeleteAll}>Delete Everything</button>

            {props.isLoading ? (
                <p>Loading...</p>
            ) : props.error ? (
                <p>Error: {props.error}</p>
            ) : props.restorePoints.length === 0 ? (
                <p>No restore points</p>
            ) : props.restorePoints.map(restorePoint => (
                <RestorePoint
                    key={restorePoint.id}
                    id={restorePoint.id}
                    title={restorePoint.title}
                    assets={restorePoint.assets}
                    onClickDelete={props.onClickDelete}
                    onClickLoad={props.onClickLoad}
                />
            ))}
        </Box>
    </Modal>
);

RestorePointModal.propTypes = {
    intl: intlShape,
    onClose: PropTypes.func.isRequired,
    onClickCreate: PropTypes.func.isRequired,
    onClickDelete: PropTypes.func.isRequired,
    onClickDeleteAll: PropTypes.func.isRequired,
    onClickLoad: PropTypes.func.isRequired,
    isLoading: PropTypes.bool.isRequired,
    restorePoints: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        title: PropTypes.string.isRequired,
        assets: PropTypes.arrayOf(PropTypes.string.isRequired).isRequired
    })),
    error: PropTypes.string
};

export default injectIntl(RestorePointModal);
