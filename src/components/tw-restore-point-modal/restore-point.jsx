import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';

class RestorePoint extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClickDelete',
            'handleClickLoad'
        ]);
    }
    handleClickDelete () {
        this.props.onClickDelete(this.props.id);
    }
    handleClickLoad () {
        this.props.onClickLoad(this.props.id);
    }
    render () {
        return (
            <div>
                {this.props.id} {this.props.title} {this.props.assets.length}

                <button onClick={this.handleClickDelete}>
                    Delete
                </button>
                <button onClick={this.handleClickLoad}>
                    Load
                </button>
            </div>
        );
    }
}

RestorePoint.propTypes = {
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    assets: PropTypes.arrayOf(PropTypes.string.isRequired).isRequired,
    onClickDelete: PropTypes.func.isRequired,
    onClickLoad: PropTypes.func.isRequired
};

export default RestorePoint;
