import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage, FormattedDate, FormattedTime} from 'react-intl';
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
        this.state = {
            thumbnail: null
        };
        this.unmounted = false;
    }

    componentDidMount () {
        RestorePointAPI.getThumbnail(this.props.id)
            .then(url => {
                if (this.unmounted) {
                    URL.revokeObjectURL(url);
                } else {
                    this.setState({
                        thumbnail: url
                    });
                }
            });
    }

    componentWillUnmount () {
        if (this.state.thumbnail) {
            URL.revokeObjectURL(this.state.thumbnail);
        }
        this.unmounted = true;
    }

    handleClickDelete (e) {
        e.stopPropagation();
        this.props.onClickDelete(this.props.id);
    }

    handleClickLoad () {
        this.props.onClickLoad(this.props.id);
    }

    formatSize () {
        const size = this.props.size;
        if (size < 1000 * 1000) {
            return `${(size / 1000).toFixed(2)}KB`;
        }
        return `${(size / 1000 / 1000).toFixed(2)}MB`;
    }

    render () {
        const createdDate = new Date(this.props.created * 1000);
        return (
            <div
                tabIndex={0}
                role="button"
                className={styles.restorePoint}
                onClick={this.handleClickLoad}
            >
                <img
                    className={styles.restorePointThumbnail}
                    src={this.state.thumbnail}
                    // This sets the image's aspect ratio. CSS is responsible for figuring out how to size it.
                    width={this.props.thumbnailWidth}
                    height={this.props.thumbnailHeight}
                />

                <div className={styles.restorePointDetails}>
                    <div className={styles.restorePointTitle}>
                        {this.props.title}
                    </div>

                    <div>
                        <FormattedDate value={createdDate} />
                        {', '}
                        <FormattedTime value={createdDate} />
                    </div>

                    <div>
                        {this.formatSize()}
                        {', '}
                        <FormattedMessage
                            defaultMessage="{n} assets"
                            // eslint-disable-next-line max-len
                            description="Describes how many assets (costumes and images) are in a restore poins. {n} is replaced with a number like 406"
                            id="tw.restorePoints.assets"
                            values={{
                                n: this.props.assets.length
                            }}
                        />
                    </div>

                    {this.props.type === RestorePointAPI.TYPE_AUTOMATIC && (
                        <div>
                            <FormattedMessage
                                defaultMessage="Autosave"
                                description="Indicates that a restore point was created automatically"
                                id="tw.restorePoints.autosave"
                            />
                        </div>
                    )}
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
    thumbnailWidth: PropTypes.number.isRequired,
    thumbnailHeight: PropTypes.number.isRequired,
    assets: PropTypes.arrayOf(PropTypes.string.isRequired).isRequired,
    onClickDelete: PropTypes.func.isRequired,
    onClickLoad: PropTypes.func.isRequired
};

export default RestorePoint;
