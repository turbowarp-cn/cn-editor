import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';
import bindAll from 'lodash.bindall';
import styles from './restore-point-modal.css';
import RestorePointAPI from '../../lib/tw-restore-point-api';

class RestorePoint extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClickDelete',
            'handleClickLoad'
        ]);
    }

    handleClickDelete (e) {
        e.stopPropagation();
        this.props.onClickDelete(this.props.id);
    }

    handleClickLoad () {
        this.props.onClickLoad(this.props.id);
    }

    formatDate () {
        // TODO: react-intl should have a proper way to do this?
        return new Date(this.props.created * 1000).toLocaleString();
    }

    formatSize () {
        const size = this.props.size;
        if (size < 1024 * 1024) {
            return `${(size / 1024).toFixed(2)}KB`;
        }
        return `${(size / 1024 / 1024).toFixed(2)}MB`;
    }

    render () {
        return (
            <div
                tabIndex={0}
                role="button"
                className={styles.restorePoint}
                onClick={this.handleClickLoad}
            >
                <div className={styles.restorePointDetails}>
                    <div className={styles.restorePointTitleOuter}>
                        <span className={styles.restorePointTitle}>
                            {this.props.title}
                        </span>
                        {this.props.type === RestorePointAPI.TYPE_AUTOMATIC && (
                            <span className={styles.restorePointType}>
                                {' '}
                                <FormattedMessage
                                    defaultMessage="(Autosave)"
                                    description="Indicates that a restore point was created automatically"
                                    id="tw.restorePoints.autosave"
                                />
                            </span>
                        )}
                    </div>
                    <div>
                        <span className={styles.restorePointDate}>
                            {this.formatDate()}
                        </span>
                        {', '}
                        <span className={styles.restorePointSize}>
                            {this.formatSize()}
                        </span>
                    </div>
                </div>

                <button
                    className={styles.deleteButton}
                    onClick={this.handleClickDelete}
                >
                    {'\xd7'}
                </button>
            </div>
        );
    }
}

RestorePoint.propTypes = {
    id: PropTypes.number.isRequired,
    title: PropTypes.string.isRequired,
    created: PropTypes.number.isRequired,
    type: PropTypes.oneOf([RestorePointAPI.TYPE_AUTOMATIC, RestorePointAPI.TYPE_MANUAL]).isRequired,
    size: PropTypes.number.isRequired,
    assets: PropTypes.arrayOf(PropTypes.string.isRequired).isRequired,
    onClickDelete: PropTypes.func.isRequired,
    onClickLoad: PropTypes.func.isRequired
};

export default RestorePoint;
