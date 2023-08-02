import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';
import bindAll from 'lodash.bindall';
import styles from './restore-point-modal.css';

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
    render () {
        return (
            <div
                tabIndex={0}
                role="button"
                className={styles.restorePoint}
                onClick={this.handleClickLoad}
            >
                <div className={styles.restorePointDetails}>
                    <div className={styles.restorePointTitle}>
                        {this.props.title}
                    </div>
                    <div>
                        <span className={styles.restorePointDate}>
                            {new Date(this.props.created * 1000).toLocaleString()}
                        </span>
                        {' '}
                        <span className={styles.restorePointAssets}>
                            <FormattedMessage
                                defaultMessage="({n} assets)"
                                description="Describes how many assets (images/costumes) are in a restore point"
                                id="tw.restorePoints.assets"
                                values={{
                                    n: this.props.assets.length
                                }}
                            />
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
    assets: PropTypes.arrayOf(PropTypes.string.isRequired).isRequired,
    created: PropTypes.number.isRequired,
    onClickDelete: PropTypes.func.isRequired,
    onClickLoad: PropTypes.func.isRequired
};

export default RestorePoint;
